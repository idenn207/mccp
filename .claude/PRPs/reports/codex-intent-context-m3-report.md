# Implementation Report: codex-intent-context M3 — hybrid L3 배선 복구

**Plan**: `.claude/plans/codex-intent-context-m3.plan.md` (frozen — `plan_hash sha256:3e2e85a4…`)
**Branch**: `codex-intent-context-m3` · **Version**: `1.30.1 → 1.31.0` (minor — PRD 최종 milestone)
**Gate artifacts**: [`.claude/notes/codex-intent-context-m3.md`](../../notes/codex-intent-context-m3.md)

## Summary

`MCCP_PLAN_REVIEW=hybrid`는 오라클(`decide.js`)·스키마·receipt 필드가 M1에 전부 실렸는데도
**실행 경로가 죽어 있었다**. `plan.md` 5.2f가 "5.2z의 Codex 블록을 verbatim 실행하라"고
지시했고, 그 블록이 띄우는 것은 receipt writer(`plan-codex-runner.js`)다 — 패널 경로에서는
5.6b가 같은 receipt를 쓰므로 writer가 둘이 된다.

M3는 배선만 고쳤다. L3를 receipt를 쓰지 않는 전용 서브커맨드(`plan-review/cli.js l3`)로
분리해 **순서 보장이 아니라 부재로** 이중 writer를 닫았고, 레코드 생산을 셸 `printf`에서
순수 오라클로 옮겨 `"verdict":""`를 구성 불가능하게 만들었으며, `hybrid` 단독 설정이
에이전트 0개로 조기 HALT하도록 했다. 발화 대상의 자동 판정은 범위 밖(UI2·UI3)이다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 13 | 15 (+2 — 아래 Deviations) |
| Tasks | 10 | 10 complete |
| 신규 test | 미명시 | 34건(l3) + 8건(command-body) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `plan-review/l3.js` 레코드 오라클 | Complete | `buildL3Record` + `bridgeArtifacts` + `buildFindingsRecord`(라이브 발견분) |
| 2 | `cli.js l3` 전용 호출 | Complete | contain→mkdir→**재-contain** · 아티팩트 4종 all-or-exit-12 |
| 3 | `plan.md` 5.2a-0 조기 HALT | Complete | 5.2b(예약) 앞 배치 — 예약 0건이라 반환도 없음 |
| 4 | `plan.md` 5.2f 재작성 | Complete | detached spawn + nonce-in-record poll · 상태 6종 |
| 5 | 5.6b `--review-l3-reason` forward | Complete | + hybrid verdict를 `l3.json`에서 읽도록(L3-Codex F1 흡수) |
| 6 | 정적 배선 단언 | Complete | 요구 3건 + 확장 5건 = 8건 |
| 7 | 오라클/서브커맨드 test | Complete | 34건(33 pass · 1 skip) |
| 8 | 라이브 완주 1회 | **부분** | L3 층 2회 완주 · receipt 축 미달 — 아래 참조 |
| 9 | 문서 + version 동기 | Complete | gate-design anchor · review.md · CLAUDE.md §3.13.3 · 4면 동기 |
| 10 | PRD status flip | Complete | `complete` + 미주장 5항목 명시 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | Pass | `node -c` 전 파일. 프로젝트에 type-check/lint 스크립트 없음(package.json 부재) |
| Unit Tests | Pass | plan-review 전체 **292건 / 291 pass / 1 skipped** |
| plan.md 린트 회귀 | Pass | plan.md를 읽는 인접 9 suite **151건 전량 pass** |
| Build | N/A | 빌드 단계 없는 순수 Node 스크립트 저장소 |
| Integration | Pass | `l3` 서브커맨드를 실제 프로세스로 spawn하는 test 11건 + 라이브 Codex 2회 |
| Edge Cases | Pass | classification 13행 · enum 밖 verdict · 빈 verdict · 부분 write 실패 · 봉쇄 위반 |
| instruction-contract | Pass | rows=31 · C1~C4 전부 pass |
| plan-conflict | Pass | `conflict:false` |

**skipped 1건은 정직한 skip이다**: `cli: artifacts are owner-only`가 `0o600`을 단언하는데
Windows는 POSIX mode 비트를 재현하지 않는다. 플랫폼이 구현하지 않는 사실을 단언하면 거짓
사실을 고정하게 되므로 완화 대신 skip했다(POSIX에서는 실행된다).

### 승계된 red (M3 diff 사거리 밖)

`plugins/mccp/scripts/receipt/tests/review-single-pass-fields.test.js:162` 1건이 실패한다.
schema가 내는 메시지와 test가 기대하는 정규식이 어긋난 drift다. **이 사이클의 변경이
아니다** — `git diff --name-only origin/main -- plugins/mccp/scripts/receipt/`가 공집합이다.
backlog 등재. 같은 디렉토리의 schema/write/dedupe 대상 **135건은 전량 pass**.

### plan Validation 3행의 오류 (정정)

plan이 적은 `node --test plugins/mccp/scripts/receipt/tests/`는 Node 24에서 디렉토리를
모듈로 해석해 `MODULE_NOT_FOUND`로 죽는다. glob 형태가 올바른 호출이다. plan 본문은
봉인돼 있어 고칠 수 없으므로 여기와 backlog에 정정을 남긴다.

## Files Changed

| File | Action | Δ |
|---|---|---|
| `plugins/mccp/scripts/lib/plan-review/l3.js` | CREATED | +152 |
| `plugins/mccp/scripts/lib/tests/plan-review-l3.test.js` | CREATED | +330 |
| `plugins/mccp/scripts/lib/plan-review/cli.js` | UPDATED | +227 / -3 |
| `plugins/mccp/commands/plan.md` | UPDATED | +274 / -58 |
| `plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js` | UPDATED | +163 |
| `docs/gate-design.md` | UPDATED | +94 |
| `docs/environment/review.md` | UPDATED | +21 / -2 |
| `CLAUDE.md` | UPDATED | +48 |
| `CHANGELOG.md` | UPDATED | +43 / -2 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | version |
| `plugins/mccp/scripts/lib/renderer/{html,markdown}.js` | UPDATED | footer version |
| `.claude/prds/codex-intent-context.prd.md` | UPDATED | M3 flip |
| `docs/multi-session-work-loop/instruction-contract.md` | UPDATED | +1 (ledger row) |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | +8 rows |
| `.claude/notes/codex-intent-context-m3.md` | CREATED | gate artifacts |

## Deviations from Plan

1. **`Files to Change` 밖 2건.** `instruction-contract.md`(+1행)는 CLAUDE.md §3.13.3 신설이
   `lint.js`의 ledger 등재를 요구해서고(미등재 시 lint 실패), `codex-findings-backlog.md`는
   §3.14가 의무화한 적재다. 둘 다 설계 확장이 아니라 절차 산출물이다.

2. **게이트 산출물이 plan 본문이 아니라 notes로 갔다.** plan은
   `plan_hash sha256:3e2e85a4…`로 봉인돼 있고 `/mccp:pr` guard 2가 ship 시점에 재-hash하므로,
   `## Codex Implementation Review`를 본문에 주입하면 그 자리에서 `stale`이 되어 PR이 막힌다.
   M1·M2·santa-adjudication 선례대로 `.claude/notes/`를 썼다(`prp-implement.md` 2.5.4가 허용).

3. **`l3-findings.json`(4번째 아티팩트)은 plan에 없다.** 라이브 실행이 찾아낸 결함의 흡수다 —
   아래 참조. plan의 `Files to Change` 안(`l3.js`·`cli.js`)에서 닫혔다.

4. **5.6b가 hybrid verdict를 `l3.json`에서 읽는다.** plan Task 5는 `--review-l3-reason`
   forward만 요구했다. 라이브 L3-Codex의 HIGH finding 흡수로 verdict source도 바꿨다.
   `mode=codex`는 무변경이라 DD5는 보존된다.

5. **Implement-Codex receipt를 Phase 3 이전이 아니라 이후에 썼다(순서 이탈).**
   `prp-implement.md`는 2.5.6(receipt write) → 2.5.7(validate) → Phase 3 EXECUTE 순서를
   요구한다. 게이트 *작업* 자체(2.5.1 dedupe 판정 · 2.5.2 결정 열거 · 2.5.3 Codex 호출 ·
   2.5.4 리뷰 섹션 · 2.5.5 security-reviewer · 2.5.5b design detector)는 전부 Phase 3
   **이전**에 수행했고, 기록 파일도 그때 작성했다. 이탈은 write 호출 시점 하나다.
   봉인된 값(`codex_verdict=skipped` · `impeccable_silent_skip=no-signal` ·
   security 미skip)은 게이트 시점의 관측 그대로이므로 receipt 내용은 정확하다. 다만 이
   순서가 지키는 불변식은 "미작성 receipt 위에서 EXECUTE를 시작하지 않는다"이고, 그 창은
   실제로 열렸다 — 다음 사이클에서는 2.5.6을 EXECUTE 진입 전에 호출한다.

## Issues Encountered

### 라이브 실행이 찾은 것 — L3 findings 유실 (흡수)

1회차 라이브 hybrid가 `divergent`를 냈는데 **무엇에 대한 이견인지 읽을 방법이 없었다.**
`l3.json`은 verdict와 reason만 싣고 `record.js#readL3`(:105-111)가 정확히 그 둘만 읽으므로
5.2h는 한 단어를 출력한다. Codex findings는 파싱된 뒤 그 단어로 접혀 버려지고 있었고,
5.2f 산문은 "findings는 5.2h를 통해 도달한다"고 **사실이 아닌 것**을 적고 있었다.

`l3-findings.json`으로 닫고(순서 계약 유지 위해 `l3.json` **앞**에 write) 산문을 정정했다.
`record.js`가 그것을 표에 싣는 것은 `Files to Change` 밖이라 backlog로 이연했다.
**이것이 Task 8이 존재하는 이유다** — 초록 test 34건은 이 결함을 하나도 잡지 못했다.

### security-reviewer (게이트) — CRITICAL 1 · MEDIUM 2 · LOW 2

CRITICAL 주장(`--focus` 셸 주입)의 **제시된 기전은 오류**였다: 매개변수 확장의 값은 명령
치환을 위해 재스캔되지 않으므로 `--focus "$FOCUS"`는 안전하다. 그러나 가리킨 방향에는
진짜 변종이 있었다 — 커맨드 본문에서 focus는 변수가 아니라 **LLM이 마크다운에 직접 쓰는
셸 리터럴**이라(5.2z가 그 형태) 백틱·`$(`가 실제로 확장된다. 5.2f를 **인용된 heredoc**으로
바꿔 흡수했다. MEDIUM 1건(`--review-dir` TOCTOU)은 리뷰 시점에 이미 같은 형태로 구현돼
있었고, MEDIUM 1건(enum 과허용)은 증거를 붙여 기각했다. 전문은 notes.

### 라이브 L3-Codex R1 — HIGH 2건

| # | 처리 |
|---|---|
| F1 동시 writer가 다른 run의 브리지 아티팩트와 짝지어진 유효 `l3.json`을 만들 수 있다 | **흡수** — hybrid에서 5.6b가 verdict를 nonce 검증된 `l3.json`에서 읽는다 |
| F2 nonce가 공유 가변 상태라 한 run이 다른 run의 결과를 수용할 수 있다 | **기각 + 증거** — `REVIEW_DIR` 전체가 공유하는 선재 성질 |

F2 기각의 근거는 `REVIEW_DIR`이 `l1.json`·`l2.json`·`decision.json`·`proof.json`·
`reservation.json`·`mode.json`을 전부 공유하는 singleton이라는 것이다(증거: Phase 5.2 진입의
`rm -f` purge 목록). 한 worktree에서 게이트 둘을 겹쳐 돌리면 L3 이전에 이미 비정합이고,
plan DD6도 이를 "선재 한계, 신규 축 아님"으로 미리 명시했다. **다만 F2가 옳게 지적한 것
하나는 고쳤다** — nonce가 "동시 실행을 가른다"는 주장이 과했다. 가르는 것은 stale뿐이고,
3면(plan.md · gate-design.md · CLAUDE.md)에서 그 문장을 정정했다. 없는 보장에 기대는
사람이 없게 하는 것이 기각의 조건이다.

### 테스트 헬퍼가 조용히 통과할 뻔한 건

`sectionLines`의 섹션 종료 조건 `/^#{1,4} /`가 **bash 주석**(`# comment`)에 매칭돼 5.2f가
8줄에서 잘렸다. `assert.match` 계열이라 red로 드러났지만, `doesNotMatch` 단언이었다면
빈 본문에 대해 **조용히 통과**했을 것이다. fence 추적기에 물어보도록 고치고 섹션 길이
하한 단언을 함께 넣었다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plan-review-l3.test.js` | 34 (33 pass · 1 skip) | classification 13행 · verdict 매핑 · enum 밖/빈 verdict 접힘 · free-text가 converged 불가 · nonce 왕복 · findings body 3종 · 아티팩트 4종 순서 · 부분 write 실패 · 봉쇄 위반 · 주입 대역이 승인 불가 · 0o600(POSIX) |
| `plan-review-command-body.test.js` | +8 | runner 0회 · verbatim 지시 부재 · `hybrid_without_l3` 소비 · 에이전트 0개 위치 · l3 호출 + nonce 대조 · 인용 heredoc · l3-reason forward · hybrid verdict source |

## Next Steps

- [ ] `/mccp:prp-commit`
- [ ] `/mccp:pr` — **진입 직전 §3.7 version 재계산 필수**(두 번째 시점). 미머지
      `diverse-agent-review-m7`이 `1.30.2`를 들고 있어 patch 자리는 좁다; 현재 target `1.31.0`
- [ ] merge 후 worktree cleanup(이 worktree는 `codex-intent-context-m2` 이름을 그대로 쓴다) +
      `claude plugin update`
