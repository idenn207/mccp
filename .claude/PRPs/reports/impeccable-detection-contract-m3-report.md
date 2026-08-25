# Implementation Report: impeccable 탐지 계약 M3 — 섀도잉 해소

**Plan**: `.claude/plans/impeccable-detection-contract-m3.plan.md` (봉인 유지 — 편집 없음)
**Branch**: `impeccable-detection-contract` · **Version**: `1.31.2 → 1.31.3`
**게이트 산출물·라이브 증거**: `.claude/notes/impeccable-detection-contract-m3.md`

## Summary

M1은 오라클을 만들고 M2는 소비처를 배선했지만, mccp 자신은 여전히 bare 이름을 하드코딩해
plugin 단독 설치를 `unknown_skill`로 떨어뜨렸다. M3는 셋을 닫는다 — 승자가 아닌 소스를 `eclipsed`로
1급 보고하고, 명령 본문 4곳이 오라클이 정한 이름을 부르게 하고, 이 저장소의 project-local 3.5.0
사본 79 파일을 재배선과 **같은 커밋**에서 제거한다. 정리 도구(`impeccable-cleanup.js`)와 `/mccp:setup`
Phase 3.5가 사용자에게 다중 사본을 보이고 승인 기반 정리를 제안한다.

라이브 결과: env 우회 없이 `detect → [mccp:impeccable] call-form: Skill(impeccable:impeccable, ...) → 실제 호출`이
연결된다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large — 일치 |
| 신규 모듈 | 1 (`impeccable-cleanup.js`) | 1 |
| Files Changed | 25행 (Files to Change) | 27 수정 + 2 신규 + 79 삭제 |
| 예정 밖 수정 | — | 2건: `docs/multi-session-work-loop/instruction-contract.md`(§3.17 heading 개명의 기계적 귀결 — plan의 `## Validation`이 요구하는 lint를 통과시키려면 필수) · `plugins/mccp/commands/plan-prd.md`(bare 리터럴 잔존분 제거) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | 라이브 측정 2건 | 완료 | (a) 성공 — `impeccable:impeccable`이 plugin 4.1.1 본문을 연다. (b) **결론 불가**(bypass 모드) → 대신 ambient 권한 대조로 "impeccable 고유 문제 아님"을 증명. 분기 판정: Task 6·7 진행 |
| 1 | 오라클 `eclipsed` | 완료 | 6개 return 전부 + `resolutionFields`. 승자는 **객체 identity**로 제외(Codex F5) |
| 2 | dep-check 라벨·표 | 완료 | `- +N eclipsed` 접미 + printer 행. 경로는 `safePath`(신규), 라벨은 `safeLabel` |
| 3 | SessionStart 정보성 1행 | 완료 | `missing` 배열과 분리, 같은 24h 시계 재사용, 새 probe 0 |
| 4 | 정리 오라클 | 완료 | 거부 규칙 6 + 닫힌 `REASONS` enum. 보안 흡수 6건 반영 |
| 5 | setup Phase 3.5 | 완료 | 3분기(shadowed / removable>0 / eclipsed는 있으나 removable=0). 3.1·3.4 산문 정정 |
| 6 | 호출부 재배선 | 완료 | 4개 본문 + alias 2 + `plan-prd.md`·`setup.md` 서술. 명령 본문의 bare 리터럴 **0건** |
| 7 | 3.5.0 사본 제거 | 완료 | `git rm -r` 79 파일 + `external.md` 앵커 5곳. Task 6과 동일 커밋(미커밋 상태로 함께 대기) |
| 8 | 문서·version·CHANGELOG·PRD | 완료 | 4면 동기 + §3.17 + gate-design M3절 + PRD milestone 3 `complete` + OQ 1·2 |
| 9 | 라이브 완주 1회 | **부분** | 재배선 경로는 라이브로 열렸으나 **디자인 축이 발화한 채 봉인된 게이트 receipt는 아직 없다** — 아래 참조 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | 이 저장소에 type-check·lint 파이프라인 없음(package.json 부재, `node --test` 직접 호출) |
| Unit Tests | 통과 | 아래 표. 신규/변경 test 파일 4개, 순증 28건 |
| Build | N/A | 빌드 산출물 없음 |
| Integration | 통과 | plan `## Validation`의 CLI 6줄 전부 실행 — 아래 |
| Edge Cases | 통과 | 심볼릭 링크 2축·중복 행·shadowed 양쪽 소스 거부·제어문자 |
| Plan-conflict detector | `conflict:false` | 괴리 없음(경미한 이탈은 아래 Deviations) |
| instruction-contract lint | C1~C4 pass | ledger S3.17 행 동기 후 |

`## Validation` 블록 실행 결과:

- `impeccable-detect.js resolve --json` → `source:plugin` · `invocation:impeccable:impeccable` · `eclipsed:[]` (Acceptance 충족)
- `dep-check.js` → `impeccable skill: available (plugin v4.1.1, impeccable:impeccable)`
- `impeccable-cleanup.js plan --json` → `ok:true` · `reason:nothing-eclipsed` · `removable:[]`
- `grep -c ".claude/skills/impeccable" docs/environment/external.md` → **0**
- `test -f .claude/notes/impeccable-detection-contract-m3.md` → 존재
- `git status --short` → **79건 삭제**

### Design Grounding (v1.18.22)

Design Grounding: **N/A (no design trigger)**. Phase 2.5.5b의 트리거가 발화하지 않아
(`SKILL_AVAIL=1` · `SIGNAL=0`) 2.5.5c capture가 없고 Phase 3.7은 완전 no-op이다. Phase 3.6
DESIGN FINISH도 같은 게이트 조건으로 skip했다(clarify/distill/polish 호출 0).

## Files Changed

| File | Action | 규모 |
|---|---|---|
| `plugins/mccp/scripts/lib/impeccable-cleanup.js` | CREATED | +~380 |
| `plugins/mccp/scripts/lib/tests/impeccable-cleanup.test.js` | CREATED | +~300 |
| `plugins/mccp/scripts/lib/impeccable-detect.js` | UPDATED | +59 / -8 |
| `plugins/mccp/scripts/lib/dep-check.js` | UPDATED | +84 / -6 |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATED | +25 |
| `plugins/mccp/commands/{plan,prp-implement,pr,code-review}.md` | UPDATED | +164 (재배선 + call-form 규칙) |
| `plugins/mccp/commands/setup.md` | UPDATED | +113 / -20 (Phase 3.5) |
| `plugins/mccp/commands/{prp-pr,review-pr,plan-prd}.md` | UPDATED | 각 서술 1행 |
| `plugins/mccp/scripts/lib/tests/{impeccable-resolve,impeccable-guard,dep-check}.test.js` | UPDATED | +356 / -32 |
| `.claude/skills/impeccable/**` | **DELETED** | **79 파일** |
| `docs/gate-design.md` | UPDATED | +93 (`#### 섀도잉 해소 (M3)`) |
| `docs/environment/external.md` | UPDATED | 앵커 5 + 측정 기준 노트 |
| `CLAUDE.md` · `CHANGELOG.md` · `plugin.json` · `renderer/{html,markdown}.js` | UPDATED | §3.17 + 4면 version |
| `.claude/prds/impeccable-detection-contract.prd.md` | UPDATED | milestone 3 `complete` + OQ 1·2 |
| `docs/multi-session-work-loop/instruction-contract.md` | UPDATED | S3.17 행 (예정 밖) |
| `.claude/notes/impeccable-detection-contract-m3.md` | CREATED | 게이트 산출물 + Task 0/9 증거 |

## Deviations from Plan

**D1 — Task 5의 제거 선택지 조건을 `eclipsed.length > 0`에서 `removable.length > 0`으로 좁혔다.**
plan은 전자로 적었으나, Task 4가 정한 규칙 1(승자 불가침)과 2(plugin 불가침)가 함께 걸리면
실사용 구성에서 `removable`이 **구조적으로 빈다** — bare 소스가 항상 이기므로 bare 사본은 승자이거나
둘 중 하나(shadowed)이고, 남는 eclipsed 행은 plugin뿐이다. 전자를 그대로 쓰면 오라클이 반드시
거부할 행동을 권하는 화면이 된다. 규칙은 손대지 않았고(각각 안전 근거가 있고 UI3·UI6이 지지한다)
화면만 정직하게 만들었다. `impeccable-cleanup.test.js`의 `rules 1+2 jointly`가 이 성질을 고정한다.

**D2 — SessionStart 배너가 `shadowed` 상태도 보고한다.** plan Task 3은 `eclipsed`가 비어 있지
않을 때로 적었는데, `shadowed:true`에서는 `eclipsed`가 **규칙상 비므로** 그 조건만 쓰면 가장 사람의
판단이 필요한 상태에서 배너가 침묵하고 무해한 상태에서만 말하게 된다. 같은 함수·같은 호출 지점·
새 probe 0으로 두 상태를 모두 보고한다.

**D3 — `instruction-contract.md`와 `plan-prd.md`를 손댔다** (Files to Change 밖). 전자는 §3.17
heading 개명의 기계적 귀결이고 plan의 `## Validation`이 요구하는 lint가 그것 없이는 fail한다.
후자는 재배선의 완결성 문제다(아래 I2).

## Issues Encountered

**I1 — 설치된 plugin cache가 1.31.0(pre-M1)이라 게이트 detect가 거짓 `skill-missing`을 냈다.**
명령 본문대로 `${CLAUDE_PLUGIN_ROOT}`로 detect를 돌리면 `skill_available:false`가 나오고
`impeccable_*` 필드가 아예 없다(그 캐시에 `resolutionFields`가 0회 등장). 그대로 썼다면
`impeccable_skipped=true`가 receipt에 실려 `/mccp:pr`을 막았을 것이고, 그 차단 사유는 M1이 이미
없앤 거짓 신호다. worktree 오라클의 답(`silent_skip:true`, 정보성)을 채택하고 노트에 기록했다.
**사용자 조치 필요: `claude plugin update`.**

**I2 — `impeccable-resolve.test.js`의 재배선 안전망이 실재하지 않았다.** CLAUDE.md §3.17과 ledger
S3.17이 모두 "재배선 없이 사본을 지우면 그 test가 red가 된다"고 적고 있었으나, 그 test는
`commands/*.md` **전문**을 훑어 리터럴을 모으므로 진짜 호출이 전부 사라져도 impeccable을
**부르지 않는다**고 적은 `plan-prd.md`의 산문 한 줄이 남아 green을 유지했을 것이다. 배선이 아니라
산문을 검사하고 있었다. test를 필드-이름 대조로 재앵커하고, 실제 기계 앵커는 `impeccable-guard.test.js`의
짝 단언으로 새로 만들었으며, 문서 두 곳의 거짓 주장을 정정했다.

**I3 — Bash 도구가 heredoc의 백슬래시를 붕괴시킨다.** `'\\n'`이 실제 개행이 되어 정밀 치환이 0회
매치했다. `String.fromCharCode(92)`로 백슬래시를 생성하는 우회를 썼다. 코드 변경 아님(작업 방식).

**I4 — 전체 스위트 sweep이 `setup-command-body.test.js` 단언 1건을 잡았다.** M2 시절 단언이
"Phase 3는 plugin 설치의 결과(`unknown_skill`/`impeccable_skipped`)를 말해야 한다"를 요구했는데,
M3가 그 결과를 바꿨으므로 같은 문장이 이제 거짓이다. guard test와 같은 부류라 같은 방식으로
처리했다 — 삭제가 아니라 **사실과 함께 뒤집었다**: 네임스페이스 이름을 여전히 명시할 것 ·
게이트가 런타임에 해소한다고 말할 것 · **`unknown_skill`을 더 이상 약속하지 말 것**(세 번째가
거짓 주장의 재유입을 막는 방향이다). 이 파일은 plan의 Files to Change 밖이다.

**I5 — 사본 제거가 `.claude/_meta/` 조사 문서의 전제 하나를 무효화했다.**
`2026-08-22-impeccable-plugin-channel-migration.md`의 P15가 `.claude/skills/impeccable/SKILL.md`를
참조하는데 `meta-research lint`의 L3는 **현재 트리에서 해소되는 경로**를 요구한다. plan은
딸려오는 문서 비용으로 `external.md`의 5곳만 열거했고 이 표면은 빠져 있었다. 발견을 지우지 않고
승계 사실로 갱신했다(79 파일이 tracked였고 v1.31.3에서 제거됐다 · 참조는 `CHANGELOG.md`로 이동).
그 문서 141행이 이미 "제거 결정에 딸려오는 비용"으로 예고한 항목이다. 저장소 전수 grep으로
깨진 마크다운 링크가 더 없음을 확인했고 `lint --all`은 violations 0이다.

**I6 — 전체 sweep의 잔존 red 54건은 전부 main 승계다 (기준선 대조로 확정).**
5,151건 sweep에서 56건이 실패했고, 그중 2건(I4·I5)이 이 milestone의 것이었다. 나머지 54건이
승계인지 추정하지 않고 HEAD(= M2까지, pre-M3) worktree를 따로 만들어 같은 파일들을 돌렸다:

| 파일 | HEAD 기준선 | 이 브랜치 |
|---|---|---|
| `santa-loop-cap.test.js` | 28 fail | 28 fail |
| `santa-adjudication.test.js` | 22 fail | 22 fail |
| `review-single-pass-fields.test.js` | 2 fail | 2 fail |
| `santa-lanes.test.js` | 1 fail | 1 fail |
| `session-processes-reclaim.test.js` | 1 fail | 1 fail |

**전 항목 동수**이므로 M3가 만든 red는 0이다. 이 대조가 없었다면 판정할 수 없었다 —
`meta-research.test.js`가 기준선에서는 통과하고 이 브랜치에서만 실패한 전례(I5)가 바로 그 이유다.
승계 red 자체는 M3 범위 밖이며 STATE.md가 `review-single-pass-fields.test.js:162`(schema↔test
문구 drift)를 이미 승계 항목으로 기록하고 있다. santa-* 51건은 그 기록에 없던 것이라 STATE.md
Open Questions에 추가했다.

## Tests Written

| Test File | 신규 | 커버 |
|---|---|---|
| `impeccable-cleanup.test.js` | **13 (신규 파일)** | 거부 규칙 6종 전부 + 디스크 무변경 · 심볼릭 링크 조상 거부 · **앵커 자신이 링크인 것은 허용**(security S1 기각 증거) · 삭제 후 postcondition · 닫힌 enum |
| `impeccable-resolve.test.js` | +5 (22 → 27) | eclipsed 규칙 (i)~(iv) + **중복 행 fixture**(3-way 비교였다면 red) |
| `dep-check.test.js` | +7 (18 → 25) | 라벨 접미 · printer 행 소독(ESC/BEL) · `safePath` 경계 · notice 3분기 · sentinel `eclipsed` 키 |
| `impeccable-guard.test.js` | +3 순증 (9 → 12) | 재배선 4본문 단언 · bare 리터럴 0건 · **짝 단언(단일 커밋 불변식)** · setup Phase 3.5 앵커 |

순증 **28건**. 영향 표면 12개 스위트 **279건 green**(`setup-command-body` · `meta-research` ·
`impeccable-detect-design-surface` · `gitignore-provision` · `session-start-*` 포함).

## Next Steps

- [ ] `/mccp:prp-commit` — Task 6 재배선과 Task 7 사본 제거는 **반드시 같은 커밋**
- [ ] `/mccp:pr` — 진입 직전 §3.7 version 재계산(두 번째 시점) 필수
- [ ] Task 9 잔여: PR 게이트(mode=pr)가 디자인 축을 발화시킨 receipt를 남기면 노트에 추가
- [ ] 사용자: `claude plugin update`로 1.31.3 설치(그전까지 세션 hook은 1.31.0 술어)
