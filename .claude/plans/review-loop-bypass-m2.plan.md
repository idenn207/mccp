# Plan: Review Loop Bypass — M2 미흡수 지적 회수

**Source PRD**: .claude/prds/review-loop-bypass.prd.md
**Selected Milestone**: M2 — 미흡수 지적 회수
**Complexity**: Medium

## Summary

M1의 단일통과 토글은 완화 경로를 **정확히 하나** 연다 — L2 quorum 비수렴(`plugins/mccp/scripts/lib/plan-review/decide.js:322`). 그 분기가 `block:false`를 반환하는 순간 `quorum.blockingFindings`는 어디로도 가지 않는다. 리뷰 기록에는 남지만 그 파일은 매 실행 덮어쓰기되고 worktree와 함께 사라진다. M2는 그 집합을 `.claude/plans/codex-findings-backlog.md`에 **기계적으로 적재**하고, 적재를 완화의 부수효과가 아니라 **전제조건**으로 만든다 — 적재할 수 없으면 완화하지 않는다.

소비 경로는 새로 만들지 않는다. `plugins/mccp/scripts/derive/sources/backlog.js:7`이 이미 이 표를 파싱하고 `plugins/mccp/scripts/lib/renderer/sections/status-grid.js:179`가 '이월 finding'으로 표면화한다. M2가 채우는 것은 그 파이프의 **비어 있던 입구**다 — 오늘 이 파일에 쓰는 코드는 저장소 전체에 0건이고, 지금까지 전부 LLM이 산문 지시에 따라 손으로 append했다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 단일 라운드가 낸 미흡수 지적이 backlog에 자동 적재된다 | direction |
| UI2 | 회수 경로를 새로 만들지 않고 이미 도는 것에 얹는다 | constraint |
| UI3 | 미흡수 지적의 유실은 0건이다 | constraint |
| UI4 | 적재하는 쪽만 기계화하고 fix-task.md 생성 연결은 하지 않는다 | exclusion |
| UI5 | quorum의 bare fail 합성 결함 수정은 본 마일스톤 밖이다 | exclusion |
| UI6 | 본 plan 게이트는 단일통과 토글 deadline_pressure로 통과시킨다 | direction |
| UI7 | 토글이 꺼진 기본 경로의 회귀는 0건이다 | constraint |
| UI8 | 토글 사용률의 대시보드 노출은 후속 축이다 | exclusion |
| UI9 | 전역이나 CI 상시 활성은 만들지 않는다 | exclusion |
| UI10 | M1이 이월한 acceptance 항목을 이 게이트에서 소진한다 | direction |
| UI11 | 기존 5종 리뷰 토글의 통합이나 은퇴는 범위 밖이다 | exclusion |
| UI12 | Codex 게이트 세 개는 무변경이다 | exclusion |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 측정 도구 | `plugins/mccp/scripts/lib/review-single-pass.js:151` | `assertSingleRound` — 리뷰 기록의 Measurement 블록을 읽어 불변식을 단언하고 **불량 입력에 fail-open하지 않는다**. exit 0에 도달하는 경로가 단 하나다 |
| append-only 원장 | `plugins/mccp/scripts/lib/review-single-pass.js:121` | dispatch 로그는 순수 append-only이며 어떤 경로에서도 purge하지 않는다 — 진입 purge를 두면 재발화가 자기 흔적을 지운다 |
| 한 줄 정규화 | `plugins/mccp/scripts/state/fix-task.js:52` | `oneLineExcerpt` — CR/LF/CRLF 전부를 접고 200자에서 절단. 표 셀에 넣을 텍스트의 기존 규약 |

<details>
<summary>+4 more patterns</summary>

| Category | Source | Pattern |
|---|---|---|
| CLI 종료코드 | `plugins/mccp/scripts/lib/plan-review/cli.js:40` | `EX_OK=0` / `EX_BLOCK=12` — 게이트 차단은 12로, 환경 문제와 구분한다 |
| 소비자 파서 계약 | `plugins/mccp/scripts/derive/sources/backlog.js:7` | 헤더 정규식 + 파이프 기준 셀 분할 + 셀 수 미달 행 무시. 작성자는 이 파서가 읽을 수 있는 형태만 만들어야 하고, 셀 안의 파이프는 분할을 깨뜨린다 |
| 순수 오라클 + 얇은 I/O | `plugins/mccp/scripts/lib/plan-review/decide.js:229` | 판정 함수는 인자만 받고 env·fs를 모른다. I/O는 CLI가 소유하므로 판정 경계를 단위 test로 고정할 수 있다 |
| 완화 경계의 코드 순서 | `plugins/mccp/scripts/lib/plan-review/decide.js:322` | 완화 분기가 차단 분기보다 **뒤**에 있어, 그 지점에 도달했다는 것 자체가 앞의 조건을 전부 통과했다는 뜻이다 |

</details>

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/plan-review/backlog-append.js` | CREATE | 미흡수 finding에서 backlog 행을 파생하고, 셀을 이스케이프하고, 멱등 append하고, parity를 단언하는 단일 모듈 |
| `plugins/mccp/scripts/lib/plan-review/cli.js` | UPDATE | `backlog-append` · `assert-backlog-parity` subcommand 추가 + usage의 halt-stage 열거에 신규 단계 등재 |
| `plugins/mccp/scripts/lib/plan-review/record.js` | UPDATE | Measurement에 `backlog_appended` · `backlog_skipped_nonblocking` 두 축 추가 — parity 단언의 판독 앵커 |
| `plugins/mccp/commands/plan.md` | UPDATE | 5.2g2 신설 — 완화 판정 직후 적재를 실행하고, 실패하면 HALT한다 |
| `plugins/mccp/scripts/lib/tests/plan-review-backlog-append.test.js` | CREATE | 행 파생 · 파이프/개행 이스케이프 · 멱등 · parity · derive 왕복 단위 test |
| `plugins/mccp/scripts/lib/tests/review-single-pass-command-body.test.js` | UPDATE | plan.md가 완화 경로에서 적재를 호출하고 실패 시 exit하는지 정적 단언 |
| `docs/gate-design.md` | UPDATE | 적재가 전제조건인 근거와 그 경계의 상주처 |
| `CLAUDE.md` | UPDATE | §3.15의 "backlog 자동 회수는 M2 소유다"를 ship된 계약으로 갱신 |
| `CHANGELOG.md` | UPDATE | v1.29.0 항목 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | 1.28.1 → 1.29.0 (§3.7 minor — 본 M2가 PRD의 마지막 마일스톤) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 (§3.7 4면) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 (§3.7 4면) |
| `.claude/prds/review-loop-bypass.prd.md` | UPDATE | M2 행 status와 Plan 셀, Open Question 갱신 |

## Design Decisions

### DD1 — 적재는 완화의 전제조건이다

적재가 실패하면 **완화하지 않는다**(HALT). 부수효과로 두면 조용히 실패했을 때 남는 것이 정확히 M1이 만든 부채 — 지적은 사라지고 receipt는 통과를 기록한다 — 이고, 그것을 막는 것이 M2의 존재 이유다.

이 HALT는 UI6("비수렴이어도 진행을 차단하지 않는다")과 충돌하지 않는다. M1의 DD2가 이미 그은 선과 같은 선이기 때문이다: 완화 대상은 `divergent`(보았고 결함을 찾았다) 하나이고 `unavailable`(인증할 수 없었다)은 완화하지 않는다. 적재 실패는 "결함을 기록할 수 없었다"이므로 후자 쪽이다.

**퇴로는 새 env가 아니라 토글을 끄는 것이다.** backlog 파일을 쓸 수 없는 상태에서 토글을 끄면 원래의 비수렴 HALT로 돌아가고, 그 경우 지적은 리뷰 기록에 남은 채 저자가 흡수한다 — 유실이 0인 상태가 유지된다. 즉 최악의 실패 모드가 "토글이 도움이 안 된다"이지 "지적이 사라진다"가 아니다.

### DD2 — 적재 대상은 blockingFindings 정확히 그 집합이다

토글이 실제로 떨어뜨리는 것은 그 배열이다(`plugins/mccp/scripts/lib/plan-review/quorum.js:159`). quorum이 실패한 **이유**가 그 배열이고, 완화는 그 실패를 무시하는 동작이므로, 적재 대상과 완화 대상이 같은 집합이어야 "유실 0"이 산술로 성립한다.

MEDIUM/LOW finding은 **적재하지 않는다**. 그것들은 애초에 quorum을 막지 않았으므로 토글이 바꾼 것이 없고, 토글이 꺼진 실행에서도 리뷰 기록에만 남는다. 적재하면 M2가 토글과 무관한 정책 변경(§3.14의 수용 임계 재정의)을 몰래 하는 것이 된다. 다만 **몇 건을 그렇게 두었는지는 명시적으로 센다** — `backlog_skipped_nonblocking`이 0으로 조용히 사라지지 않고 기록된다.

severity `UNKNOWN`(판독 불가)과 `FAIL`(bare verdict 합성)도 `blockingFindings`의 원소이므로 함께 적재한다. `FAIL` 행은 §3.14가 해제 조건으로 지목한 `plugins/mccp/scripts/lib/plan-review/quorum.js:175` 합성의 산물이라 노이즈일 수 있으나, **적재는 판정이 아니다** — 그것을 걸러내는 것은 severity 판정을 M2가 다시 하는 일이고 UI5가 범위 밖으로 둔 축이다.

### DD3 — 멱등성은 digest 태그로 확보하고, purge는 하지 않는다

행마다 `id=<digest8>`을 싣는다. digest는 `reviewed_plan_hash` · `perspective` · `severity` · raw claim을 NUL로 이어 붙인 sha256이고, append 전에 backlog 본문에서 그 태그를 찾아 이미 있으면 건너뛴다.

`reviewed_plan_hash`로 keying하는 이유는 M1의 dispatch 로그와 같다: 같은 본문에 대한 재실행은 같은 digest라 중복되지 않고, 흡수로 본문이 바뀐 뒤의 새 실행은 새 digest 그룹이라 정직하게 새 행이 쌓인다. **어떤 경로에서도 기존 행을 지우거나 고치지 않는다** — backlog는 append-only 원장이고, 과거 행에는 이미 사람이 단 흡수 주석이 붙어 있다.

### DD4 — 소비자 파서 계약을 깨지 않는다

`plugins/mccp/scripts/derive/sources/backlog.js:39`는 셀을 파이프로 분할하므로 finding 텍스트 안의 파이프는 표를 찢는다. 그래서 셀에 넣기 전에 파이프를 HTML 수치 참조로 치환한다 — 마크다운은 그것을 파이프로 렌더하고 파서는 분할하지 않는다. 개행은 `plugins/mccp/scripts/state/fix-task.js:52`와 같은 규약으로 접고, 200자에서 절단한다.

절단은 정보를 잃지만 원문은 `.claude/reviews/plan-review-<slug>.md`에 남으므로, 각 행이 그 경로를 함께 싣는다. 표 셀을 무제한으로 두면 대시보드 rail이 읽지 못하는 폭이 된다.

### DD5 — 새 환경변수를 만들지 않는다

M2는 토글을 하나도 추가하지 않는다. PRD가 문제로 지목한 것 자체가 "리뷰 강도를 조절하는 토글이 5종 이상 흩어져 있다"이고, 적재를 끄는 스위치는 곧 유실을 켜는 스위치다. 동작 여부는 오직 `MCCP_REVIEW_SINGLE_PASS`의 활성 여부가 정한다.

### DD6 — 실행 위치는 5.2g와 5.2h 사이다

적재는 verify-proof(5.2g) **뒤**여야 한다 — proof가 무효인 실행의 finding을 원장에 남기면 검증되지 않은 리뷰가 감사 기록이 된다. 그리고 record(5.2h) **앞**이어야 한다 — record가 Measurement에 적재 결과를 실어야 `assert-backlog-parity`가 M1의 `assert-single-round`와 같은 방식(기록을 읽어 단언)으로 성립한다.

## Tasks

### Task 1: backlog-append 오라클 신설

- **Action**: 순수 함수 `deriveBacklogRows({decision, l2, planPath, slug, today})`가 완화 여부(`decision.single_pass_reason` 존재)를 보고 `quorum.blockingFindings`에서 행 배열을 만든다. `escapeCell`(파이프 치환, 개행 접기, 200자 절단), `rowDigest`, `renderRow`를 함께 노출한다. I/O는 `appendRows({repoRoot, rows})` 하나에만 두고, 기존 본문에서 `id=<digest8>` 존재 여부로 멱등 처리한다. 표 헤더가 없으면 **append하지 않고 실패**한다 — 파서가 못 읽을 위치에 쓰는 것은 적재가 아니다.
- **Mirror**: `plugins/mccp/scripts/lib/plan-review/decide.js:229`의 순수 오라클 경계 · `plugins/mccp/scripts/state/fix-task.js:52`의 한 줄 정규화
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/plan-review-backlog-append.test.js`

### Task 2: CLI subcommand 두 개 배선

- **Action**: `backlog-append --review-dir <d> --plan <p> --slug <s>`가 적재 후 `$REVIEW_DIR/backlog.json`에 `{appended, skipped_duplicate, skipped_nonblocking, rows}`를 기록하고 실패를 `EX_BLOCK`으로 낸다. `assert-backlog-parity --record <md>`가 기록의 Measurement와 backlog 실제 행 수를 대조하며, 불량 입력은 전부 비영점으로 끝난다. usage의 halt-stage 열거에 `5.2g2`를 등재한다.
- **Mirror**: `plugins/mccp/scripts/lib/plan-review/cli.js:40`의 종료코드 규약 · `plugins/mccp/scripts/lib/review-single-pass.js:151`의 fail-open 금지
- **Validate**: `node plugins/mccp/scripts/lib/plan-review/cli.js 2>&1 | grep -q backlog-append && echo WIRED`

### Task 3: record.js Measurement 2축 확장

- **Action**: `$REVIEW_DIR/backlog.json`을 읽어 `backlog_appended`와 `backlog_skipped_nonblocking`을 Measurement에 싣는다. 아티팩트 부재는 **0이 아니라 null**로 기록하고 `### Recording degradations`에 사유를 남긴다 — 부재와 0은 다른 사실이고, 0으로 적으면 적재가 아예 안 돌았다는 것이 통과 기록으로 읽힌다.
- **Mirror**: `plugins/mccp/scripts/lib/plan-review/record.js:258`의 "부재는 null, 추론하지 않는다"
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/plan-review-backlog-append.test.js`

### Task 4: plan.md 5.2g2 배선

- **Action**: 5.2g와 5.2h 사이에 fenced block을 추가한다. `decision.json`의 `single_pass_reason`이 비어 있으면 no-op으로 통과하고(토글이 꺼진 실행은 무변경), 있으면 `backlog-append`를 호출한다. 비영점이면 recorder를 `--halt-stage 5.2g2`로 호출한 뒤 `[MCCP-GATE-STOP]`을 출력하고 **명시적으로 exit**한다. 5.2a의 HALT 단계 표에 `5.2g2` 행을 추가한다.
- **Mirror**: `plugins/mccp/commands/plan.md`의 5.2g 블록 — recorder는 실패 분기의 마지막 문장이 될 수 없고 모든 분기가 명시 exit로 끝난다
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/review-single-pass-command-body.test.js`

### Task 5: command-body 정적 단언 확장

- **Action**: 기존 command-body test에 세 단언을 추가한다. 첫째, plan.md에 `backlog-append`를 호출하는 블록이 존재한다. 둘째, 그 블록이 `single_pass_reason`을 읽어 게이팅한다. 셋째, 그 블록의 실패 분기가 `--halt-stage 5.2g2`와 `exit`를 함께 갖는다.
- **Mirror**: `plugins/mccp/scripts/lib/tests/review-single-pass-command-body.test.js:102`의 dispatch-log 배선 단언
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/review-single-pass-command-body.test.js`

### Task 6: 문서·버전 4면 동기

- **Action**: `docs/gate-design.md`에 DD1/DD2/DD6의 근거를 상주시키고, `CLAUDE.md` §3.15의 "M2 소유다" 문장을 ship된 계약으로 갱신한다. `plugin.json` 1.28.1 → 1.29.0과 함께 `plugins/mccp/scripts/lib/renderer/html.js` page-foot · `plugins/mccp/scripts/lib/renderer/markdown.js` derived 줄 · `CHANGELOG.md`를 같은 값으로 맞춘다. PRD의 M2 행 status와 Open Question을 갱신한다.
- **Mirror**: CLAUDE.md §3.7의 4면 동기 목록 — `i18n-surface.test.js`는 동기 대상이 아니라 검증 수단이다
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

## Validation

```bash
# 1. 신규 + 인접 단위 test
node --test plugins/mccp/scripts/lib/tests/plan-review-backlog-append.test.js
node --test plugins/mccp/scripts/lib/tests/review-single-pass-command-body.test.js
node --test plugins/mccp/scripts/lib/tests/review-single-pass.test.js
node --test plugins/mccp/scripts/lib/tests/review-single-pass-gate.test.js

# 2. version 4면 동기 (§3.7 검증 수단)
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 3. 소비자 왕복 — 적재한 행을 derive가 실제로 읽는가
node -e "const s=require('./plugins/mccp/scripts/derive/sources/backlog').scanBacklog(process.cwd()); if(!s.ok){throw new Error(s.error);} console.log('backlog rows:', s.count);"

# 4. 전수 회귀 — 토글 unset 기본 경로
#    (Node v24에서 `--test <dir>/` 는 MODULE_NOT_FOUND 이므로 glob으로 넘긴다)
node --test plugins/mccp/scripts/lib/tests/*.test.js
node --test plugins/mccp/scripts/receipt/tests/*.test.js
node --test plugins/mccp/scripts/derive/tests/*.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/*.test.js

# 5. 기존 receipt corpus 무손상
node plugins/mccp/scripts/lib/evidence-audit.js --json
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| M2가 닫는 유실 채널이 L2 축 하나뿐인데 PRD 문구는 세 게이트를 함의한다 | 확실 | 이것이 **의도된 범위**다. 토글이 implement/pr에서 하는 일은 라운드 캡 고정뿐이고 R0의 Codex finding은 여전히 LLM이 YAGNI triage해 backlog에 적재한다 — 토글이 새로 만든 유실 채널은 L2 완화 하나다. Acceptance가 이 주장 자체를 검증 항목으로 갖는다 |
| 적재 HALT가 토글을 무용지물로 만든다 (backlog 파일이 없거나 헤더가 깨진 저장소) | 낮음 | 실패 메시지가 헤더 부재를 정확히 지목하고, 퇴로는 토글을 끄는 것 하나로 고정된다(DD1). 새 escape env를 만들지 않으므로 우회 표면이 늘지 않는다 |
| 셀 이스케이프가 불완전해 대시보드 파서가 표를 찢는다 | 중간 | `scanBacklog`를 직접 호출하는 왕복 test를 단위 test에 포함한다(Validation 3). 파이프·개행·200자 초과를 각각 fixture로 고정한다 |

<details>
<summary>+3 more risks</summary>

| Risk | Likelihood | Mitigation |
|---|---|---|
| digest 멱등 키가 흔들려 같은 지적이 매 실행 중복 적재된다 | 중간 | digest 입력이 `reviewed_plan_hash`·perspective·severity·raw claim으로 고정이고 재실행 멱등을 단위 test가 단언한다. 본문이 바뀌면 새 hash 그룹이 되는 것은 의도된 동작이다 |
| FAIL 합성 행이 backlog를 노이즈로 채운다 (§3.14 F6 누수) | 중간 | 적재는 판정이 아니므로 거르지 않는다(DD2). 비율이 높으면 그것이 §3.14 해제 조건을 실제로 닫을 근거가 되고, 그때까지는 backlog 1줄로 관측된다 |
| Measurement 키 추가가 기존 record test의 고정된 키 집합을 깨뜨린다 | 중간 | 키는 추가만 하고 기존 키의 의미·형태는 건드리지 않는다. Validation 4의 전수 회귀가 record 관련 test를 함께 돌린다 |

</details>

## Design Critique

detector: `design_signal=true` (signal files: Task 6의 `renderer/html.js` · `renderer/markdown.js`
footer version 동기 + `status-grid.js`·`backlog.js` 인용). retry cap 2, 2회 발화 후 `CONVERGED`.

- **R0 — HIGH 1건 (H4 한 화면 항목 수 상한)**: `## Patterns to Mirror`가 4행을 펼치고
  (상한 3), `## Risks`가 6행을 전부 평평하게 펼쳤다. 각각 상위 3개만 노출하고 나머지를
  `<details><summary>+N more</summary>`로 접어 흡수했다. Risks는 접으면서 순서도 중요도순으로
  바꿨다 — 가장 정직하게 남겨야 할 항목(유실 채널이 L2 축 하나뿐)이 접히는 쪽에 있었다.
- **R1 — CONVERGED**: H1(heading depth ≤ 3 — 본문 최대 `###`) · H2(강조색 토큰 없음, markdown
  평문) · H3(미렌더 marker·MD0xx·부유 entity 없음) · H4(위 2개 면 적용) 모두 통과.

**H4를 적용하지 않은 4개 면과 그 이유** — 접으면 다른 게이트를 깨거나 계약을 가린다:

- `## User Intent` — `intent-context.js`가 표를 직접 파싱한다. 구조를 감싸면 섹션이 **부재**로
  취급돼 게이트가 막힌다.
- `## Files to Change` — L1의 C2/C3가 행을 직접 걷는다(`l1-check.js:116`). 접으면 검사 대상이 준다.
- `## Tasks` — L1의 C4가 `### Task N` 블록마다 Validate 줄을 요구한다.
- `## Acceptance` — 판정 기준이라 접힌 항목이 "덜 중요한 기준"으로 읽히면 안 된다. M1도 접지 않았다.

이 판단은 M1 plan의 같은 절과 동일한 규칙을 따른 것이지 새로 만든 예외가 아니다.

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)
- [ ] **라이브 완주 산출물**: 토글을 켠 plan 게이트 1회 실행이 (a) `.claude/plans/codex-findings-backlog.md`에 `id=` 태그를 가진 신규 행 N개를 남기고 (b) `.claude/reviews/plan-review-<slug>.md`의 Measurement가 `backlog_appended`를 N으로 싣고 (c) `assert-backlog-parity`가 exit 0을 낸다. N은 그 실행의 blockingFindings 길이와 같다
- [ ] **멱등 확인**: 같은 본문으로 게이트를 재실행하면 backlog 행 수가 변하지 않는다
- [ ] **기본 경로 무변경**: 토글 unset으로 게이트를 완주하면 backlog에 신규 행이 0개이고 Measurement의 `backlog_appended`가 null이다
- [ ] **M1 이월 acceptance (a) 소진**: 본 M2 plan 게이트 자체를 `MCCP_REVIEW_SINGLE_PASS=deadline_pressure`로 완주해, 그 receipt에서 `resolution.review_verdict`가 `divergent`이고 `meta.review_single_pass_reason`이 `deadline_pressure`이며 `meta.review_single_pass_bypassed_verdict`가 true인 세 필드를 직접 확인한다

## Out of Scope (M2)

- `fix-task.md` 생성 경로와의 연결 — 운영자 판정(2026-08-18). backlog는 "나중에 한 번에 고친다"는 원장이고 fix-task는 "다음 턴에 즉시 고쳐라"는 Stop-loop 품질 실패 채널이라 성격이 정면으로 다르다. PRD M2의 Outcome 문구("기존 fix-task 생성 경로가 그것을 그대로 집어간다")는 실측과 어긋난다 — `plugins/mccp/scripts/state/fix-task.js`는 backlog를 읽지 않고, backlog를 기계적으로 읽는 것은 `plugins/mccp/scripts/derive/sources/backlog.js`와 대시보드다. 본 plan은 그 소비 경로에 얹는다
- `plugins/mccp/scripts/lib/plan-review/quorum.js:175`의 bare fail 합성 결함(§3.14 임시 규칙의 해제 조건) — 운영자 판정. quorum 판정 경계를 건드리는 별개 축이다
- Codex 게이트 3종의 동작 변경 · terminal ship gate verdict 판정 변경
- 토글 사용률의 대시보드 노출 (PRD Open Question 4 — 미결로 유지)
- `deferred_to_prd_completion`으로 미룬 검증의 PRD 종료 시 강제 장치 (PRD Open Question 1 — 미결로 유지)

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 없으므로 **어떤 impeccable
명령도 호출하지 않는다** — 아래는 구현자를 위한 체크리스트다. 본 M2의 렌더 표면 변경은 footer
version 문자열 2곳뿐이므로 실제로는 대부분의 행이 no-op일 가능성이 높다.

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

<!-- placeholder: will be replaced by Phase 7.3 -->
