# Implementation Report: leadtime-observability M2 — span-join

> plan: `.claude/plans/leadtime-observability-m2.plan.md` (본문 무편집 — 봉인된
> `plan_hash` 유지) · 게이트 기록: `.claude/notes/leadtime-observability-m2.md`
> 실행일 2026-09-02 · branch `leadtime-observability`

## Summary

`leadtime.js`가 두 번째 축 `post_panel_span`(패널 종료 → ship)을 낸다. 끝점을 두 앵커로
**각각** 산출하고 절대 합치지 않으며(DD2), 미짝 레코드 전건을 닫힌 5종으로 분류해 합계
등식을 fail-closed로 강제한다(DD4). ship 자격은 `pr-ship-gate.js`의 오라클을 부른
반환값이고 재구현하지 않는다(DD14). 최상위 `state`는 실린 축들의 합성값이 됐다(DD11).

PRD Open Question 4가 갈렸다: **completion-ledger는 쓰기가 멈춘 것이 맞다.**

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 조인·분류 자체보다 **증인의 방향별 자격**이 설계 비용의 대부분이었다 |
| Files Changed | 9 | 10 (`.claude/notes/…` 1건 추가 — 아래 Deviations) |
| 실측 재현 | baseline 표와 일치할 것 | **전건 일치** (11/0.38d/1.74d · 12/0.28d/5.92d · LS6/-S6/L-5 · 무증거 skip 6 · override 5) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `post_panel_span` 2계열 조인 | Complete | 리더 4종 자체 구현(`evidence-audit.js` 재사용 안 함 — 이유는 Deviations) |
| 2 | 미짝 사유 분해 + 합계 등식 | Complete | 5종 전부 도달 가능 · 등식 두 계열 모두 성립 |
| 3 | 앵커 불일치 (지표 4) | Complete | **실측 결과가 plan의 전제를 부분 반증** — 아래 Issues |
| 4 | state ladder · 부재 규칙 · `renderHuman` | Complete | `axis` 스칼라 제거 · `panel_span.state` 추가 · damaged-first 양축 적용 |
| 5 | 회귀 test | Complete | 19 → 47건 (M2가 28건 추가) |
| 6 | 문서 동결 + PRD 정정 | Complete | `post-panel-span.md` 신규 + `panel-span.md` 재생성 + PRD OQ 2·4 종결 |
| 7 | §3.7 version 4면 | Complete | **1.33.8 → 1.34.2** (재계산 — 아래 Deviations) |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | Pass | `node --check` clean. 프로젝트에 type-check/lint 스크립트 없음(package.json 부재) |
| Unit Tests | Pass | `leadtime.test.js` **47/47** · `plan-review-corpus.test.js` 33/33 · `i18n-surface.test.js` 10/10 · renderer 전체 672/672 |
| Build | N/A | 빌드 단계 없는 Node 스크립트 트리 |
| Integration | Pass | 실코퍼스 완주: `--json` exit 0 · `state=ok` · human render 정상 |
| Edge Cases | Pass | 음수 span · read_error · 증인 unavailable · 관측 0건 · 축 부재 전부 픽스처로 고정 |

### plan `## Validation` 블록 (전건)

| 검사 | 결과 |
|---|---|
| `post_panel_span` 부재도 실패로 보는 가드 | Pass — 축 실림 |
| `by_anchor` 계열 정확히 2개 | Pass |
| 키 whitelist(병합 금지) | Pass — stray 0 |
| `axes`/`axes_present` 재도입 금지 | Pass |
| `state === "ok"` | Pass |
| `state_is_composite === true` | Pass |
| DD14 근거 4필드 존재 + `qualified <= total` | Pass — 39/71 · unproven-skip 6 · override 5 |
| `corpus.js` 출력 무변경 (PRD 결정 3) | Pass — `diff` 공집합 |
| 게이트 배선 diff 공집합 (UI7/DD10) | Pass — `--exit-code` 통과 |
| 동결 블록 ↔ 라이브 stdout 바이트 일치 | Pass — 두 문서 모두 |

### Design Grounding

Design Grounding: N/A (Phase 2.5.5c 캡처 없음 — 2.5.5b 시점 `design_signal=0`이라
트리거가 발화하지 않았고 Phase 3.7은 완전 no-op).

### Design Finish (Phase 3.6)

post-EXECUTE 재도출에서 `design_signal=1`이 됐다 — EXECUTE가 `renderer/html.js` ·
`renderer/markdown.js`(§3.9 whitelist)를 §3.7 version 동기로 건드렸기 때문이다.
`renderingSurface=false`(변경 파일에 `.tsx/.css/.html` 0건)라 finish 5종이 전부
`recommend`로 강등됐고, 그 결과를 receipt `meta.impeccable_commands_routed`에 restamp했다
(`clarify`·`distill`·`harden`·`optimize`·`polish` — 전부 `recommended`). 적용한 cleanup
없음.

> 2.5.5b(pre)와 3.6(finish)의 detector 결과가 **다른 것은 정상**이다 — 전자는 EXECUTE
> 이전의 빈 diff를, 후자는 produced diff를 본다. 그 사실이 receipt에 `silent_skip=true`와
> `commands_routed=[…]`로 **함께** 남아 있다.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/leadtime.js` | UPDATED | +882 / -~30 |
| `plugins/mccp/scripts/lib/tests/leadtime.test.js` | UPDATED | +518 |
| `docs/leadtime-observability/post-panel-span.md` | CREATED | +1412 |
| `docs/leadtime-observability/panel-span.md` | UPDATED | 동결 블록 재생성 + 수치 갱신 |
| `.claude/prds/leadtime-observability.prd.md` | UPDATED | milestone 2 → complete · OQ 2·4 종결 · OQ 신설 1건 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.33.8 → 1.34.2 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | page-foot version |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | derived 줄 version |
| `CHANGELOG.md` | UPDATED | `## [1.34.2]` 신규 + `currently` 노트 |
| `.claude/notes/leadtime-observability-m2.md` | CREATED | Implement-Codex 게이트 기록 |

## Deviations from Plan

1. **게이트 기록을 plan 본문이 아니라 `.claude/notes/`에 뒀다.** Phase 2.5.4가 지시한
   plan 본문 주입을 실행하자 `plan_hash`가 바뀌어 상류 `mccp-plan-codex` receipt가
   **stale**이 됐다(2.5.7 read-back이 exit 2로 차단). 이는 구조적 결함이며
   [memory: plan-receipt-goes-stale-at-implement]가 기록한 그대로다. audited bypass를
   쓰는 대신 **명령 본문이 스스로 허용하는 대체 위치**(2.5.4의 "or `.claude/notes/…`",
   Step A의 `<plan or notes path>`)를 택했다 — plan을 원래 바이트로 되돌려 hash가
   `sha256:d3fd826a…`로 복원됐고 chain이 우회 없이 통과했다. 기록의 완결성은 동일하고,
   "Codex가 리뷰한 plan과 구현되는 plan이 바이트 동일"이라는 실질 보장이 살아 있다.

2. **`evidence-audit.js`의 리더를 재사용하지 않았다.** plan의 Patterns는 그 파일의 RAW
   ledger **규약**을 미러하라고 했고 그것은 지켰지만, 함수 자체는 `present`도
   child-process 상태도 내지 않아 DD15의 `source_unavailable`을 판정할 수 없다
   (Implement-Codex R1 F2가 지목). `leadtime.js` 자체 리더가 소스마다
   `{dir, present, read_error, parse_failures, files}`를 낸다.

3. **version 목표가 `1.33.9`가 아니라 `1.34.2`다.** plan Task 7의 잠정값은 origin/main이
   `1.33.6`일 때 계산된 것이고, 실행 시점 main은 **`1.34.1`**(1.33.7 · 1.34.0 · 1.34.1
   발행)이다. §3.7 forward-only대로 main head 위의 다음 patch 자리를 택했다. Task 7이
   요구한 "두 번 재계산" 중 첫 번째를 수행한 것이며, **`/mccp:pr` 진입 직전 재계산이
   여전히 남아 있다**.

4. **`key_mismatch`의 판정 근거를 plan보다 넓게 잡았다.** plan의 Measured Baseline은
   `plan_file_hash ≠ reviewed_plan_hash` 5건을 예로 들었지만, 대칭적이고 방어 가능한
   정의로 "같은 소스 안에서 **다른 축의 식별자**(hash 또는 `decision_id`)로는 대응물이
   찾아지는데 이 축의 키로만 안 맞는 경우"를 썼다. 그래서 hash 축의 `key_mismatch`가
   16건으로 더 크다 — 리뷰 후 plan 본문이 바뀌는 것이 이 저장소에서 구조적으로 정상이기
   때문이며(게이트 자신이 섹션을 주입한다) 결함 보고가 아니다.

## Issues Encountered

1. **지표 4의 전제가 실측으로 부분 반증됐다 — 그대로 보고했다.** plan은 "두 앵커의 불일치
   자체가 지표 4"라고 적었는데, 양쪽 매치 6건의 `anchor_delta_ms`가 **전건 정확히 0**이다.
   ledger 엔트리의 `completed_at`이 ship receipt의 `meta.created_at`을 그대로 복사하기
   때문이다 — 두 앵커는 독립된 두 증인이 아니라 **한 사건의 두 기록**이다. 시각 불일치는
   구조적으로 0에 가깝고 살아있는 신호는 **커버리지 차이**(`ledger`만 5 · `ship`만 6)다.
   숨기지 않고 `post-panel-span.md`에 절을 만들어 적고 PRD에 새 Open Question으로 올렸다.
   이 사실은 DD2를 약화하지 않고 **강화한다**: 합쳐도 값은 안 변하지만 어느 소스가
   증언했는지가 사라지고, 그것이 오늘 유일하게 정보를 가진 축이다.

2. **`not_shipped`가 오늘 코퍼스에서 0건이다.** 증인 4종 만장일치 부정이 필요한데 이
   저장소의 plan은 거의 전부 커밋돼 있어 git 증인이 `yes`를 낸다. 버킷이 죽은 것이
   아니라 비어 있는 것이며, 도달 가능성은 짝 test가 직접 증명한다(증인 하나를
   `unavailable` → `no`로 바꾸면 같은 입력이 `unclassified` → `not_shipped`로 넘어간다).
   plan이 DD4·DD5·DD11에서 세 번 고쳐 낸 '도달 불가 버킷' 오류를 반복하지 않기 위해
   test로 못박고 문서에 명시했다.

3. **`.claude/state/evidence-claims/`가 receipt write를 1회 차단했다.** holder가
   `session f2141c6e` / PID 13816이었는데 **그 PID가 이 세션 자신의 프로세스**였다 —
   세션 시작의 `/clear`가 같은 `claude.exe` 안에서 session id만 회전시켰기 때문이다.
   liveness가 PID 생존으로 판정하므로 가드는 이를 "다른 live 세션"으로 읽는다. 우회
   토글을 쓰지 않고 **문서화된 복구인 claim TTL(15분) 만료를 기다려** 해소했다.
   가드의 실제 결함이지만 이 milestone의 사거리가 아니라 backlog 축이다(아래).

4. **`plugins/mccp/scripts/lib/tests/` 전체 스위트는 10분에 타임아웃한다.** 이 변경과
   무관한 선재 성질이다(codex를 실제 spawn하는 test 포함). `leadtime.js`를 require하는
   test 파일은 `leadtime.test.js` 하나뿐임을 확인했고(grep), 영향 범위의 스위트는 전부
   개별 실행해 green이다. 전체 스위트 green을 **주장하지 않는다**.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/lib/tests/leadtime.test.js` | +28 (19 → 47) | 2계열 분리·병합금지 · 음수 span 도달성 · `pickAnchor` 선택 규칙 · ship 자격 4방향(divergent 배제 / 무증거 skip 배제 / 증거 있는 skip 포함 / override 포함) · 오라클 위임 호출 형태 · 5종 사유 전부 도달 · 닫힌 키 집합 · **`unavailable` ↔ `no` 짝 test** · git 증인 실패 · 증인 비대칭(자격 있음/없음) · DD13 분해 withhold · 반대축 read_error · 교차표 분할 · disagreement ↔ coverage.both · 단일축 레코드 배제 · 축 부재/damaged-first/합성 5경로 · 패널 시각 부재 · UI3 렌더 순서 |

## 이연 (backlog 후보)

- **evidence-claim의 liveness가 `/clear` 후 session-id 회전을 자기 자신과 구분하지
  못한다.** PID가 살아 있으므로 `other-live-holder`로 거부되고 15분 TTL을 기다려야 한다.
  같은 프로세스·같은 worktree·같은 work unit이면 승계를 허용하는 것이 옳아 보이나,
  evidence-claim 축의 변경이라 별도 판단이 필요하다.

## Next Steps

- [ ] `/mccp:prp-commit`
- [ ] `/mccp:pr` — **진입 직전 §3.7 version 재계산 필수**(형제 worktree 활성 · main이
      이 세션 중에도 움직였다). 동시에 **M1의 `## [1.33.8]` 항목을 base 머지 시점에 위로
      밀어야 한다** — 지금은 main의 `1.34.1`보다 낮은 번호다.
- [ ] PR-Codex는 반드시 발화한다(`codex_verdict=divergent`라 cross-gate dedupe가 닫혀
      있다). 정상이며 우회하지 않는다.
- [ ] plan은 `.claude/plans/`에 그대로 둔다 — 아카이브는 PRD 전체 완료 후
      `/mccp:archive-complete` 소관이다(§3.11 C2). M3 one-line-consumption이 남아 있다.
