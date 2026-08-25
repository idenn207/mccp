# santa-delta-review M3 — 사이클 잔여 마감 처리 대장

> `/mccp:prp-implement .claude/plans/santa-delta-review-m3.plan.md` 산출물.
> Task 7(backlog 전건 처리) · Task 8(fix-task 방출)의 감사 앵커다.

backlog rows processed: 68

---

## 1. backlog 처리 대장 (Task 7)

판정 기준은 §3.14 — CRITICAL·HIGH만 그 자리에서 흡수하고 나머지는 증거를 붙여 이연한다.
**행은 하나도 삭제하지 않았다.** 각 행은 `ABSORBED` 또는 이연 사유 중 **정확히 하나**를 갖는다
(기계 판정: Task 7 Validate의 `node -e` 검사).

| 축 | 건수 |
|---|---|
| 사이클 행 총계 (`source_plan` ⊃ `santa-delta-review`) | 68 |
| 이번 M3가 새로 흡수 (`ABSORBED → santa-delta-review M3`) | 4 |
| 이전 사이클이 이미 판정(triage 행 등) | 15 |
| 이번 M3가 새로 이연 사유를 붙임 | 46 |
| 이번 M3가 새로 **적재**한 이연 행(정정 기록 · main 승계 red · CHANGELOG 중복) | 3 |
| 미처리 잔여 | **0** |

### 1.1 흡수 4건 — 무엇이 닫았는가

| backlog 행 | 닫은 것 | 증거 |
|---|---|---|
| `MCCP_REVIEW_SINGLE_PASS`가 test 스위트를 상시 red로 만든다 (HIGH) | Task 3 | `lib/tests/helpers/gate-env.js` · 세 파일이 env 두 조합에서 동일 결과 (53/0 · 90/0 · 77/0) |
| plan-conflict 호출이 두 점 diff를 쓴다 (MEDIUM) | Task 5 | `prp-implement.md` 두 자리 세 점화 + `plan-conflict-detector.test.js` 정적 단언. unplanned 270 → 41 → 32 |
| `compareCoverage`의 `totals.unknown`이 full 쪽만 계수 (LOW) | Task 2 | 양측 records 배열 계수 + `side:'unindexable'` + `measured`/`degradedReason` |
| L2 security HIGH: 표면 절대경로 (HIGH — 방향은 미성립, 잔여는 실재) | Task 4 | `toRepoRelative` 2자리 + `hook-trace-root-anchor.test.js` 단언 2 |

**사이클 밖 1건도 함께 닫혔다.** origin/main이 2026-08-23에 적재한
「backlog 파서가 이스케이프된 파이프 문자에서 finding을 잘라 버린다」(`impeccable-detection-contract-m6`)는
Task 1이 **같은 커밋에서** 닫는다 — finding 셀의 잔여 파이프를 다시 이어 붙이므로 꼬리 소실이 사라지고,
`invalid_count`의 리터럴 0을 실제 계수로 바꿔 «관측되지 않는다»는 지적의 나머지 절반도 닫는다.
그 행에도 `ABSORBED` 마커를 달았다(사이클 필터 밖이라 위 68건 계수에는 들어가지 않는다).

### 1.2 이연 64건 — 왜 닫지 않았는가

- **46건은 L2 패널이 자동 적재한 원본 기록 행이다.** 판정은 같은 사이클의 «triage:» 행과 plan 본문
  `## Review History` 표가 소유하고, 원문은 `.claude/reviews/plan-review-santa-delta-review.md`가 정본이다.
  여기 재기술하면 정본이 둘이 된다.
- **나머지 15건**은 이전 사이클이 이미 판정한 triage/기각 행이다.
- 개별 사유를 가진 이연(각 행에 file:line 증거와 함께 기록):
  - `impeccable-detect.js`의 EXECUTE 이전 diff — 게이트 *발화 시점* 축. **이번 M3에서도 재현됐다**:
    `Files to Change`에 `renderer/html.js`·`markdown.js`(둘 다 `DESIGN_SURFACE_PATHS` 원소)가 있는데도
    2.5.5b가 `design_signal=false`(reason=`no-signal`)를 냈다. origin/main의 동일 관측과 같은 축이라 합류.
  - fixture tmpdir 미정리 — 기존 관례와 일치(`santa-loop-cap`·`santa-lanes`도 같다). 한 파일만 고치면 관례가 갈린다.
  - 신규 test 24.6s — 의도된 설계 대가(`santa-detection-coverage.test.js:8-12`가 이유를 명시).
  - `/mccp:milestone-close` plan-body 스탬프 — 명령 본문 축이고 M3의 `Files to Change` 밖.
  - security-reviewer MEDIUM-1/-2 — 각각 M1이 부분 배송 / 설계로 이미 닫힘.
  - `SCOPE_ASSERTION_PATTERNS` 완결성 — 1차 통제가 구조 분리라 목록 확장은 증거 없는 추가.

---

## 2. fix-task 방출 기록 (Task 8a)

§3.2·DD9대로 **파일을 손으로 편집하지 않았다.** 아래는 그 에스컬레이션이 *요구한 것*을 실제로
처리했다는 대응표다. 파일 자체의 생성·소비는 `stop-review-loop` writer가 했다.

| fix-task | 요구 | backlog 행 | M3에서 처리한 곳 |
|---|---|---|---|
| M1 게이트 `codex_divergent` (`fix-task-applied.md`, 2026-08-21T04:08Z) | 「리뷰의 미해소 지적을 각각 처리하라」 | `santa-delta-review-m1.plan.md` 19행 | 전건에 흡수/이연 마커 (§1) |
| M3 plan 게이트 `codex_divergent` (`fix-task.md`, 2026-08-21T07:28Z) | 동일 | `santa-delta-review-m3.plan.md` 7행 | 전건에 흡수/이연 마커 (§1) |

- 두 fix-task가 가리킨 지적은 `plan-review/cli.js backlog-append`가 기계 적재한 바로 그 행들이다.
- **파일 lifecycle**: 커밋 `86d95a7`이 writer의 산출(`fix-task.md` 소비 → `fix-task-applied.md`)을 기록했다.
  이후 `origin/main` 머지에서 `fix-task-applied.md`는 **main 쪽(2026-08-23,
  `impeccable-detection-contract-m5`)을 취했다** — 이 파일은 한 건만 담는 writer 소유 레코드이고
  main의 것이 더 새롭기 때문이다. 이 사이클의 방출 기록은 git history와 이 표가 소유한다.
- 결과적으로 `git diff --name-only origin/main...HEAD`에 `fix-task` 파일이 **0건**이다.

---

## 3. 머지 검증 (Task 6 · §3.5.1)

- **의도한 삭제: 없음.** `git diff --diff-filter=D --name-only origin/main...HEAD` 출력이 **비어 있다**.
  `origin/main`의 tracked 파일 중 머지 인덱스에서 사라진 것도 **0건**(집합 대조 실측).
- 충돌 9건은 전부 **파일 단위**로 해소했다. `--ours` 통짜 취함은 쓰지 않았다.

| 파일 | 해소 |
|---|---|
| `CHANGELOG.md` | 양측 항목 **전부 보존** + forward-only 재번호 |
| `.claude/plans/codex-findings-backlog.md` | append-only 원장 → **합집합**(ours 66행 + theirs 248행) |
| `plugin.json` · `renderer/html.js` · `renderer/markdown.js` | 1.32.5로 4면 동기 |
| `santa-loop-cap.test.js` | 양측이 *서로 다른* 신규 의존을 문서화 → **합집합** |
| `.claude/settings.json` | main의 `MCCP_REVIEW_SINGLE_PASS` 제거를 존중(forward-only) |
| `.claude/state/STATE.md` | 세션 연속성 scratchpad → 이 브랜치 쪽, writer가 재생성 |
| `.claude/state/fix-task-applied.md` | writer 소유 단일 레코드 → main 쪽(더 새로움) |

### 3.1 version 재계산 (DD8)

plan은 `1.30.5`를 예상했으나 **그 전제가 성립하지 않았다** — 머지 시점 `origin/main`의 천장은
`1.32.2`였고 `1.30.2`는 이미 diverse-agent-review M7에 발행돼 있었다(`c9e941c`). forward-only로
M1 `1.30.2 → 1.32.3` · M2 `1.30.3 → 1.32.4` · M3 `1.32.5`. **`/mccp:pr` 진입 직전 다시 재계산해야 한다.**

### 3.2 머지가 드러낸 회귀 1건

`origin/main`이 추가한 env-contract lint **L10**(«registry evidence names the toggle it points at»)이
머지 직후 실패했다. 원인은 이 브랜치의 M1이 `santa/lanes.js`에 주석 블록을 넣어 `ENV_BLIND_LANE`이
26행 → 32행으로 밀렸는데 registry evidence가 `:26`으로 남은 것이다. main에서는 통과하고 이 브랜치에서만
실패하므로 **이 브랜치가 만든 회귀**다. `:32`로 정정(`27efa9d`) → L1~L10 전부 통과.

---

## 4. plan-conflict 가드 실측 (Task 5)

| 조합 | unplanned |
|---|---|
| 두 점 + 백틱 미제거 (착수 전) | 270 |
| 세 점 + 백틱 미제거 | 41 |
| 세 점 + 백틱 제거 (수정 후) | 32 |

수정 후 M3 plan 기준 잔여는 아래 30건이다(위 32는 착수 시점 측정, 아래는 Task 7까지 진행한 뒤의 재측정).
**오발화가 아니다** — 이 브랜치는 M1·M2 커밋을 함께 지고 있어 M3 plan의 `Files to Change` 밖 산출물이
실제로 들어 있다. 즉 가드가 처음으로 *참인 것을 보고*한다.

M1·M2 사이클 산출물(12): `.claude/PRPs/reports/santa-delta-review-m1-report.md` ·
`…-m2-report.md` · `.claude/milestone-closures/santa-delta-review-m2.md` ·
`.claude/notes/santa-delta-review-m1-implement-codex.md` · `…-m1.md` ·
`…-m2-implement-codex.md` · `…-m2.md` · `.claude/plans/santa-delta-review-m1.plan.md` ·
`…-m2.plan.md` · `…-m3.plan.md` · `.claude/reviews/plan-review-santa-delta-review-r0.md` ·
`…-santa-delta-review.md`

M1·M2가 바꾼 소스(11): `plugins/mccp/scripts/lib/santa/cli.js` · `lanes.js` · `ledger.js` ·
`scope-delta.js` · `seal.js` · `plugins/mccp/scripts/lib/tests/santa-adjudication.test.js` ·
`santa-delta-command-body.test.js` · `santa-delta-instrumentation.test.js` · `santa-lanes.test.js` ·
`santa-scope-delta.test.js` · `plugins/mccp/scripts/receipt/schema.js` · `write.js`

M1·M2가 바꾼 문서/설정(6): `CLAUDE.md` · `docs/ENVIRONMENT.md` · `docs/environment/review.md` ·
`plugins/mccp/commands/santa-loop.md` · `.claude/state/STATE.md` ·
`plugins/mccp/scripts/lib/env-contract/registry.js`(M3의 L10 정정 — §3.2)

---

## 5. plan이 틀린 곳 (정정 기록 — UI12)

**plan의 acceptance 판정 명령 한 건이 결함이었다.** Task 5 Validate와 acceptance (d)가 쓰는

```
grep -cE 'git diff --name-only origin/[^ ]+\.\.[^.]' plugins/mccp/commands/prp-implement.md
```

는 `[^ ]+`가 **여분의 점을 삼킬 수 있어** 세 점 표기(`origin/main...HEAD`)도 매칭한다. 즉 고쳐도 0이
되지 않으며, 그 명령으로는 「두 점 0건」을 판정할 수 없다. 실측: 수정 완료 후에도 이 정규식의 카운트는 2다.

정정한 판정 명령(문자 클래스에서 점을 뺀다):

```
grep -cE 'git diff --name-only origin/[^ .]+\.\.[^.]' plugins/mccp/commands/prp-implement.md
```

실측 반증: 두 점 fixture 1건 매칭 · 세 점 fixture 0건 매칭 · 현재 본문 **0**.
`plan-conflict-detector.test.js`의 정적 단언도 같은 정정된 형태를 쓰고, 정규식이 아무것도 못 잡는 상태로
굳는 것을 막기 위해 두 fixture 문자열을 같은 test 안에서 함께 단언한다.

**plan 본문은 고치지 않았다** — `mccp-implement-codex` receipt가 `plan_hash`
`sha256:74e77fbd…`로 봉인했고, 편집하면 `/mccp:pr`의 staleness 가드에 막힌다(§3.11 guard 2).

---

## 6. 이 milestone이 주장하지 않는 것 (UI12)

- **탐지율을 검증하지 않았다.** M3가 닫은 것은 *사이클이 남긴 부채*이지 *PRD의 측정 축*이 아니다.
  `MCCP_SANTA_DELTA_SCOPE` default는 `off` 그대로이고 델타 스코프 로직은 무접촉이다.
- **Layer 2는 여전히 미실행이다.** PRD Open Question으로 열려 있고 M3는 그것을 닫지 않는다 → 아카이브 보류(DD10).
- **cross-model adversarial review를 받지 않았다.** Plan-Codex는 M3에서 발화한 적이 없고
  (`mccp-plan-codex/santa-delta-review-m3` receipt 부재 · plan의 `## Codex Adversarial Review`가 placeholder),
  Implement-Codex도 `MCCP_CODEX_DISABLED=1`로 skip됐다. 실제로 발화한 리뷰는 L2 다관점 패널 3라운드뿐이다.
  사유는 `.claude/notes/santa-delta-review-m3-implement-codex.md`에 기록했다(§3.16).
- **security-reviewer가 발화하지 않았다.** 세션 운영 제약(UI9)이 서브에이전트 발화를 금지하므로
  receipt에 `security_skipped=true`를 정직하게 봉인했다. Task 4의 `toRepoRelative`가 경로 탈출 축을
  건드리므로 카테고리를 낮춰 회피하지 않고 skip으로 기록했다 — 그 값은 `/mccp:pr`에서 blocking으로 남는다.
